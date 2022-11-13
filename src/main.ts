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
type PrepareResult = typeof PrepareSuccess | typeof PrepareUnrecognizedCommand | typeof PrepareSyntaxError;

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
function serializeRow(source: Row, departure: number, page: Uint8Array): void {
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

const PAGE_SIZE = 4096;
const TABLE_MAX_PAGES = 100;
const ROWS_PER_PAGE = PAGE_SIZE / ROW_SIZE;
const TABLE_MAX_ROWS = ROWS_PER_PAGE * TABLE_MAX_PAGES;

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

function prepareStatement(input: string): [PrepareResult, Statement?] {
  const CLAUSE_INSERT = "insert" + " ";
  if (input.startsWith(CLAUSE_INSERT)) {
    const args = input
      .replace(CLAUSE_INSERT, "")
      .split(" ")
      .filter(a => a !== "");

    if (args.length < 3) {
      return [PrepareSyntaxError];
    }
    const rowToInsert: Row = {
      id: parseInt(args[0]),
      email: args[1],
      username: args[2]
    };

    return [PrepareSuccess, { type: StatementInsert, rowToInsert }];
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

function executeStatement(statement: Statement, table: Table): ExecuteResult {
  switch (statement?.type) {
    case (StatementInsert):
      return executeInsert(statement, table);
    case (StatementSelect):
      return executeSelect(statement);
  }
}

function executeInsert(statement: Statement, table: Table): ExecuteResult {
  if (table.numRows >= TABLE_MAX_ROWS) {
    return ExecuteTableFull;
  }

  const [pageNum, byteOffset] = rowSlot(table, table.numRows);
  serializeRow(statement.rowToInsert, byteOffset, table.pages[pageNum]);
  ++table.numRows;

  return ExecuteSuccess;
}

function executeSelect(statement: Statement): ExecuteResult {
  console.log(statement);
  console.log("exec select");
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
      case (PrepareSyntaxError):
        console.log("Syntax error. Could not parse statement.");
        break;
      case (PrepareUnrecognizedCommand):
        console.log(`Unrecognized keyword at start of ${input}`);
        continue;
    }

    switch (executeStatement(statement, table)) {
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
