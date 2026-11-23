/** 自动生成：来源 health.schema.json；通过 verification/health-contract.mjs 维护，禁止手改。 */
/** 进程健康响应，供 Web 与设备诊断共用，不代表业务就绪。 */
export interface HealthResponse {
  /** Spring Actuator 的进程健康状态，不可为空。 */
  status: "UP" | "DOWN" | "OUT_OF_SERVICE" | "UNKNOWN";
}
