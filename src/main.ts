import * as readline from "readline";

const readInputs = async function* (prompt: string) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    for (; ;) {
      yield new Promise((resolve) => rl.question(prompt, resolve));
    }
  } finally {
    rl.close();
  }
};

const main = async () => {
  for await (const input of readInputs("db > ")) {
    if (input == ".exit") {
      process.exit();
    } else {
      console.log(`Unrecognized command ${input}.\n`);
    }
  }
};

main();
