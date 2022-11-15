// import { executeInsert, ExecuteTableFull, newTable, StatementInsert } from "../src/main.js";
//
// describe("main", () => {
//   it("executeInsert", async () => {
//     const table = newTable();
//
//     let res:ExecuteResult;
//     for (let i = 0; i < 1409; i++) {
//       res = await executeInsert({
//         type: StatementInsert,
//         rowToInsert: {
//           id: i,
//           username: `yasu${i}`,
//           email: `yasu${i}@yas.com`
//         }
//       }, table);
//
//     }
//
//     expect(res).toBe(ExecuteTableFull);
//   });
// });
