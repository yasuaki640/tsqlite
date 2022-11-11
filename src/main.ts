import * as readline from "readline";

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
  rowToInsert: Row;
}

const ID_SIZE = 4;
const USERNAME_SIZE = COLUMN_USERNAME_SIZE;
const EMAIL_SIZE = COLUMN_EMAIL_SIZE;
const ID_OFFSET = 0;
const USERNAME_OFFSET = ID_OFFSET + ID_SIZE;
const EMAIL_OFFSET = USERNAME_OFFSET + USERNAME_SIZE;
const ROW_SIZE = ID_SIZE + USERNAME_SIZE + EMAIL_SIZE;

// メモリにデータを書き込み
const serializeRow = (source: Row, destination: unknown, memory: WebAssembly.Memory) => {
};

const doMetaCommand: (input: string) => MetaCommandResult = (input: string) => {
  if (input.includes(".exit")) {
    process.exit();
  } else {
    return MetaCommandUnrecognizedCommand;
  }
};

const prepareStatement: (input: string) => [PrepareResult, Statement?] = (input: string) => {
  const CLAUSE_INSERT = "insert" + " ";
  if (input.startsWith(CLAUSE_INSERT)) {
    const args = input.replace(CLAUSE_INSERT, "").split(" ");
    if (args.length < 3) {
      return [PrepareSyntaxError];
    }
    return [PrepareSuccess, { type: StatementInsert }];
  }
  if (input === "select") {
    return [PrepareSuccess, { type: StatementSelect }];
  }

  return [PrepareUnrecognizedCommand];
};

const readInputs = async function* (prompt: string): AsyncGenerator<string> {
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
};

const executeStatement: (statement: Statement) => void = (statement: Statement) => {
  switch (statement.type) {
    case (StatementInsert):
      console.log("This is where we would do an insert.");
      break;
    case (StatementSelect):
      console.log("This is where we would do an select.");
      break;
  }
};

const main: () => void = async () => {
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
      case (PrepareUnrecognizedCommand):
        console.log(`Unrecognized keyword at start of ${input}`);
        continue;
    }

    executeStatement(statement);
    console.log("Executed.");
  }
};

main();
