import * as readline from "readline";
import * as fs from "fs";

const ExecuteSuccess = Symbol();
const ExecuteTableFull = Symbol();
type ExecuteResult = typeof ExecuteSuccess | typeof ExecuteTableFull

const MetaCommandSuccess = Symbol();
const MetaCommandUnrecognizedCommand = Symbol();
type MetaCommandResult = typeof MetaCommandSuccess | typeof MetaCommandUnrecognizedCommand;

const PrepareSuccess = Symbol();
const PrepareNegativeID = Symbol();
const PrepareUnrecognizedCommand = Symbol();
const PrepareSyntaxError = Symbol();
const PrepareStringTooLong = Symbol();
type PrepareResult =
  typeof PrepareSuccess
  | typeof PrepareNegativeID
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
const ROWS_PER_PAGE = Math.trunc(PAGE_SIZE / ROW_SIZE);
const TABLE_MAX_ROWS = Math.trunc(ROWS_PER_PAGE * TABLE_MAX_PAGES);

type Pager = {
  fileDescriptor: number;
  fileLength: number;
  pages: Uint8Array[];
}

type Table = {
  pager: Pager;
  numRows: number;
}

function getPage(pager: Pager, pageNum: number): Uint8Array {
  if (pageNum > TABLE_MAX_PAGES) {
    console.error("Tried to fetch page number out of bounds. %d > %d", pageNum, TABLE_MAX_PAGES);
    process.exit(1);
  }

  if (pager.pages[pageNum] === null) {
    // Cache miss. Allocate memory and load from file.
    const page = Buffer.alloc(PAGE_SIZE);
    let numPages = Math.trunc(pager.fileLength / PAGE_SIZE);

    // We might save a partial page at the end of the file
    if (pager.fileLength % PAGE_SIZE) {
      ++numPages;
    }

    if (pageNum <= numPages) {
      try {
        fs.readSync(pager.fileDescriptor, page, 0, PAGE_SIZE, pageNum * PAGE_SIZE);
      } catch (e) {
        console.error("Error reading file: %s", e.message);
        process.exit(1);
      }
    }

    pager.pages[pageNum] = page;
  }

  return pager.pages[pageNum];
}

function rowSlot(table: Table, rowNum: number): [Uint8Array, number] {
  const pageNum = Math.trunc(rowNum / ROWS_PER_PAGE);
  const page = getPage(table.pager, pageNum);
  const rowOffset = rowNum % ROWS_PER_PAGE;
  const byteOffset = rowOffset * ROW_SIZE;
  return [page, byteOffset];
}

function pagerOpen(filename: string): Pager {
  const flag = fs.existsSync(filename) ? "r+" : "w+";
  const fd = fs.openSync(filename, flag);

  const { size } = fs.statSync(filename);

  const pages: Uint8Array[] = new Array(TABLE_MAX_PAGES).fill(null);

  return {
    fileDescriptor: fd,
    fileLength: size,
    pages
  };
}

function dbOpen(filename: string): Table {
  const pager = pagerOpen(filename);
  const numRows = pager.fileLength / ROW_SIZE;

  return { numRows, pager };
}

function pagerFlush(pager: Pager, pageNum: number, size: number): void {
  if (pager.pages[pageNum] === null) {
    console.error("Tried to flush null page");
    process.exit(1);
  }

  const bytesWritten = fs.writeSync(pager.fileDescriptor, pager.pages[pageNum], 0, size, pageNum * PAGE_SIZE);

  if (bytesWritten === -1) {
    console.log("Error writing:");
    process.exit(1);
  }
}

function dbClose(table: Table): void {
  const pager = table.pager;
  const numFullPages = Math.trunc(table.numRows / ROWS_PER_PAGE);

  for (let i = 0; i < numFullPages; i++) {
    if (pager.pages[i] === null) {
      continue;
    }
    pagerFlush(pager, i, PAGE_SIZE);
  }

  // There may be a partial page to write to the end of the file
  // This should not be needed after we switch to a B-tree
  const numAdditionalRows = table.numRows % ROWS_PER_PAGE;
  if (numAdditionalRows > 0) {
    const pageNum = numFullPages;
    if (pager.pages[numFullPages] !== null) {
      pagerFlush(pager, pageNum, numAdditionalRows * ROW_SIZE);
    }
  }

  try {
    fs.closeSync(pager.fileDescriptor);
  } catch (e) {
    console.error("Error closing db file.");
    process.exit(1);
  }
}

function doMetaCommand(input: string, table: Table): MetaCommandResult {
  if (input.includes(".exit")) {
    dbClose(table);
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

  if (!idStr || !username || !email) {
    return [PrepareSyntaxError];
  }

  if (username.length > COLUMN_USERNAME_SIZE || email.length > COLUMN_EMAIL_SIZE) {
    return [PrepareStringTooLong];
  }

  const id = parseInt(idStr);
  if (id < 0) {
    return [PrepareNegativeID];
  }

  const rowToInsert: Row = {
    id,
    username,
    email
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

function executeStatement(statement: Statement, table: Table): ExecuteResult {
  switch (statement?.type) {
    case (StatementInsert):
      return executeInsert(statement, table);
    case (StatementSelect):
      return executeSelect(statement, table);
  }
}

function executeInsert(statement: Statement, table: Table): ExecuteResult {
  if (table.numRows >= TABLE_MAX_ROWS) {
    return ExecuteTableFull;
  }

  const [page, byteOffset] = rowSlot(table, table.numRows);
  serializeRow(statement.rowToInsert, byteOffset, page);

  ++table.numRows;

  return ExecuteSuccess;
}

function printRow(row: Row): void {
  console.log(`(${row.id}, ${row.username}, ${row.email})`);
}

function executeSelect(statement: Statement, table: Table): ExecuteResult {
  for (let i = 0; i < table.numRows; i++) {
    const [page] = rowSlot(table, table.numRows);
    const row: Row = deserializeRow(page, i * ROW_SIZE);
    printRow(row);
  }
  return ExecuteSuccess;
}

async function main(): Promise<void> {
  if (process.argv.length < 3) {
    console.error("Must supply a database filename.");
    process.exit(1);
  }

  const filename = process.argv[2];
  const table = dbOpen(filename);
  for await (const rawInput of readInputs("db > ")) {
    const input = rawInput.trim();
    if (input.startsWith(".")) {
      switch (doMetaCommand(input, table)) {
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
      case (PrepareNegativeID):
        console.log("ID must be positive.");
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

    switch (executeStatement(statement, table)) {
      case (ExecuteSuccess):
        console.log("Executed.");
        break;
      case (ExecuteTableFull):
        console.log("Error: Table full.");
        break;
    }
  }
}

main();
