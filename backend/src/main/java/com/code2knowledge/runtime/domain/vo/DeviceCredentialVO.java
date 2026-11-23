package com.code2knowledge.runtime.domain.vo;

import lombok.Value;

/** 设备兑换结果只返回设备端，浏览器列表永不返回该对象。 */
@Value
public class DeviceCredentialVO {
    /** 设备UUID。 */
    String id;
    /** 256位专用凭证，30天到期，禁止日志输出。 */
    String token;
    /** 凭证有效期ISO时间。 */
    String expiresAt;
}
