import * as readline from "readline";

const ExecuteSuccess = Symbol();
const ExecuteTableFull = Symbol();
type ExecuteResult = typeof ExecuteSuccess | typeof ExecuteTableFull

const MetaCommandSuccess = Symbol();
const MetaCommandUnrecognizedCommand = Symbol();
type MetaCommandResult = typeof MetaCommandSuccess | typeof MetaCommandUnrecognizedCommand;

const PrepareSuccess = Symbol();
const PrepareUnrecognizedCommand = Symbol();
const PrepareSyntaxError = Symbol();
const PrepareStringTooLong = Symbol();
type PrepareResult =
  typeof PrepareSuccess
  | typeof PrepareUnrecognizedCommand
  | typeof PrepareSyntaxError
  | typeof PrepareStringTooLong;

const StatementInsert = Symbol();
const StatementSelect = Symbol();
type StatementType = typeof StatementInsert | typeof StatementSelect;

const COLUMN_USERNAME_SIZE = 32;
const COLUMN_EMAIL_SIZE = 255;
type Row = {
  id: number;
  username: string;
  email: string;
}

type Statement = {
  type: StatementType;
  rowToInsert?: Row;
}

const ID_SIZE = 4; // byte
const USERNAME_SIZE = COLUMN_USERNAME_SIZE; // byte
const EMAIL_SIZE = COLUMN_EMAIL_SIZE; // byte
const ID_OFFSET = 0;
const USERNAME_OFFSET = ID_OFFSET + ID_SIZE;
const EMAIL_OFFSET = USERNAME_OFFSET + USERNAME_SIZE;
const ROW_SIZE = ID_SIZE + USERNAME_SIZE + EMAIL_SIZE;

function getNthDigit(num: number, nth: number): number {
  return +num.toString()[nth];
}

// メモリにデータを書き込み
async function serializeRow(source: Row, departure: number, page: Uint8Array): Promise<void> {
  const idLen = Math.min(ID_SIZE, source.id.toString().length);
  for (let i = 0; i < idLen; i++) {
    page[departure + i] = getNthDigit(source.id, i);
  }

  const usernameLen = Math.min(USERNAME_SIZE, source.username.length);
  for (let i = 0; i < usernameLen; i++) {
    page[departure + USERNAME_OFFSET + i] = source.username.charCodeAt(i);
  }

  const emailLen = Math.min(EMAIL_SIZE, source.email.length);
  for (let i = 0; i < emailLen; i++) {
    page[departure + EMAIL_OFFSET + i] = source.email.charCodeAt(i);
  }
}

// メモリからデータを取得
function deserializeRow(page: Uint8Array, departure: number): Row {
  let idStr = "";
  for (let i = 0; i < ID_SIZE; i++) {
    const digit = page[departure + i];
    if (digit === 0) break;
    idStr += digit.toString();
  }

  let username = "";
  for (let i = 0; i < USERNAME_SIZE; i++) {
    const code = page[departure + USERNAME_OFFSET + i];
    if (code === 0) break;
    username += String.fromCharCode(code);
  }

  let email = "";
  for (let i = 0; i < EMAIL_SIZE; i++) {
    const code = page[departure + EMAIL_OFFSET + i];
    if (code === 0) break;
    email += String.fromCharCode(code);
  }

  return {
    id: parseInt(idStr),
    username,
    email
  };
}

const PAGE_SIZE = 4096;
const TABLE_MAX_PAGES = 100;
const ROWS_PER_PAGE = PAGE_SIZE / ROW_SIZE;
const TABLE_MAX_ROWS = Math.trunc(ROWS_PER_PAGE * TABLE_MAX_PAGES);

type Table = {
  numRows: number;
  pages: Uint8Array[];
}

function rowSlot(table: Table, rowNum: number): [number, number] {
  const pageNum = Math.trunc(rowNum / ROWS_PER_PAGE);
// TODO demand loading
  const rowOffset = rowNum % ROWS_PER_PAGE;
  const byteOffset = rowOffset * ROW_SIZE;
  return [pageNum, byteOffset];
}

function newTable(): Table {
  const buffer = new ArrayBuffer(PAGE_SIZE * TABLE_MAX_PAGES);

  const pages: Uint8Array[] = [];
  for (let i = 0; i < PAGE_SIZE * TABLE_MAX_PAGES; i += PAGE_SIZE) {
    const p = new Uint8Array(buffer.slice(i, (i + PAGE_SIZE)));
    pages.push(p);
  }

  return { numRows: 0, pages };
}

function doMetaCommand(input: string): MetaCommandResult {
  if (input.includes(".exit")) {
    process.exit();
  } else {
    return MetaCommandUnrecognizedCommand;
  }
}

const CLAUSE_INSERT = "insert" + " ";

function prepareInsert(input: string): [PrepareResult, Statement?] {
  const args = input
    .replace(CLAUSE_INSERT, "")
    .split(" ")
    .filter(split => split !== "");

  const [idStr, username, email] = args;

  if (!(idStr && username && email)) {
    return [PrepareSyntaxError];
  }

  if (username.length > COLUMN_USERNAME_SIZE || email.length > COLUMN_EMAIL_SIZE) {
    return [PrepareStringTooLong];
  }


  const rowToInsert: Row = {
    id: parseInt(idStr),
    username: args[1],
    email: args[2]
  };

  return [PrepareSuccess, { type: StatementInsert, rowToInsert }];
}

function prepareStatement(input: string): [PrepareResult, Statement?] {
  if (input.startsWith(CLAUSE_INSERT)) {
    return prepareInsert(input);
  }

  if (input === "select") {
    return [PrepareSuccess, { type: StatementSelect }];
  }

  return [PrepareUnrecognizedCommand];
}

async function* readInputs(prompt: string): AsyncGenerator<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    for (; ;) {
      yield new Promise<string>((resolve) => rl.question(prompt, resolve));
    }
  } finally {
    rl.close();
  }
}

async function executeStatement(statement: Statement, table: Table): Promise<ExecuteResult> {
  switch (statement?.type) {
    case (StatementInsert):
      return await executeInsert(statement, table);
    case (StatementSelect):
      return executeSelect(statement, table);
  }
}

async function executeInsert(statement: Statement, table: Table): Promise<ExecuteResult> {
  if (table.numRows >= TABLE_MAX_ROWS) {
    return ExecuteTableFull;
  }

  const [pageNum, byteOffset] = rowSlot(table, table.numRows);
  await serializeRow(statement.rowToInsert, byteOffset, table.pages[pageNum]);

  ++table.numRows;

  return ExecuteSuccess;
}

function printRow(row: Row): void {
  console.log(`(${row.id}, ${row.username}, ${row.email})`);
}

function executeSelect(statement: Statement, table: Table): ExecuteResult {
  for (let i = 0; i < table.numRows; i++) {
    const [pageNum] = rowSlot(table, table.numRows);
    const row: Row = deserializeRow(table.pages[pageNum], i * ROW_SIZE);
    printRow(row);
  }
  return ExecuteSuccess;
}

async function main(): Promise<void> {
  const table = newTable();
  for await (const input of readInputs("db > ")) {
    if (input.startsWith(".")) {
      switch (doMetaCommand(input)) {
        case (MetaCommandSuccess):
          continue;
        case(MetaCommandUnrecognizedCommand):
          console.log(`Unrecognized command ${input}`);
          continue;
      }
    }

    const [res, statement] = prepareStatement(input);

    switch (res) {
      case (PrepareSuccess):
        break;
      case (PrepareStringTooLong):
        console.log("String is too long.");
        continue;
      case (PrepareSyntaxError):
        console.log("Syntax error. Could not parse statement.");
        break;
      case (PrepareUnrecognizedCommand):
        console.log(`Unrecognized keyword at start of ${input}`);
        continue;
    }

    switch (await executeStatement(statement, table)) {
      case (ExecuteSuccess):
        console.log("Executed.");
        break;
      case (ExecuteTableFull):
        console.log("Error:Table full.");
        break;
    }
  }
}

main();
