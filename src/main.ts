import { Controller } from "./controller/Controller";

async function main(): Promise<void> {
  const ctrl = new Controller();
  await ctrl.init();
  console.log("[Smart Traffic] Init OK");
}

main().catch((e) => {
  console.error("[Smart Traffic] Error en init:", e);
});

export {};
