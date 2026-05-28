import type { DatasetSourceType } from "@/lib/types"

export function validateSyncSourceConfig(sourceType: DatasetSourceType, sourceConfig: Record<string, unknown>) {
  void sourceConfig
  if (sourceType === "manual") return null
  return "动态更新已统一为脚本更新，请在项目的同步脚本中配置并手动触发。"
}
