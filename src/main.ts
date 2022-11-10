import * as readline from "readline";

const MetaCommandSuccess = Symbol();
const MetaCommandUnrecognizedCommand = Symbol();
type MetaCommandResult = typeof MetaCommandSuccess | typeof MetaCommandUnrecognizedCommand;

const PrepareSuccess = Symbol();
const PrepareUnrecognizedCommand = Symbol();
type PrepareResult = typeof PrepareSuccess | typeof PrepareUnrecognizedCommand;

const StatementInsert = Symbol();
const StatementSelect = Symbol();
type StatementType = typeof StatementInsert | typeof StatementSelect;

interface Statement {
  type: StatementType;
}

const doMetaCommand: (input: string) => MetaCommandResult = (input: string) => {
  if (input.includes(".exit")) {
    process.exit();
  } else {
    return MetaCommandUnrecognizedCommand;
  }
};

const prepareStatement: (input: string) => [PrepareResult, Statement?] = (input: string) => {
  if (input.startsWith("insert ")) {
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
