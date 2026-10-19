// As chaves das automações. Desligadas por padrão, nesta ordem:
//  1) env AUTOMACOES_ENABLED=true (servidor) — sem ela o webhook não guarda nada e o motor não roda;
//  2) Organization.automationsEnabled (só o administrador liga, em Admin › Clientes);
//  3) Automation.active (cada automação) + Automation.dryRun (ensaio, ligado por padrão).

/* eslint-disable @typescript-eslint/no-explicit-any */

export function automationsGlobal(): boolean {
  return process.env.AUTOMACOES_ENABLED === "true";
}

export interface AutomationSwitch { global: boolean; org: boolean; on: boolean; message: string }

export function automationSwitch(organization: any): AutomationSwitch {
  const global = automationsGlobal();
  const org = organization?.automationsEnabled === true;
  const on = global && org;
  const message = on
    ? ""
    : !org
      ? "As automações estão desligadas para esta conta. Você pode montar e testar (simulação), mas nada é recebido nem enviado até o suporte ligar."
      : "As automações estão desligadas no servidor (AUTOMACOES_ENABLED). Você pode montar e testar (simulação), mas nada é recebido nem enviado.";
  return { global, org, on, message };
}
