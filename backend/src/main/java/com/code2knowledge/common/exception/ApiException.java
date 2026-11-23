package com.code2knowledge.common.exception;



/** 受控业务失败；消息只携带可向客户端展示的中文，不携带SQL和凭证。 */
public class ApiException extends RuntimeException {
    /** HTTP失败状态，采用400、401、403、404、409等标准语义。 */
    private final int status;
    /** 稳定错误码，供客户端分支处理。 */
    private final String code;
    /**
     * 创建受控失败，不记录请求内容。
     *
     * @param status HTTP状态码，不为空
     *
     * @param code 稳定协议错误码，不为空
     *
     * @param message 面向用户的中文消息，不含敏感正文
     */
    public ApiException(int status, String code, String message) { super(message); this.status = status; this.code = code; }
    /** @return HTTP失败状态码，不为空 */
    public int getStatus() { return status; }
    /** @return 稳定错误码，不为空 */
    public String getCode() { return code; }
}
