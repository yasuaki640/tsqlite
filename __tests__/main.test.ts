import { executeInsert, StatementInsert } from "../src/main.js";

describe("main", () => {
  it("executeInsert", () => {
    executeInsert({type: StatementInsert,rowToInsert},);
  });
});
