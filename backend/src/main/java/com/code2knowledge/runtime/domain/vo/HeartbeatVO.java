package com.code2knowledge.runtime.domain.vo;

import lombok.Value;

/** 设备凭证验证后的心跳确认，不能作为任何任务执行授权。 */
@Value
public class HeartbeatVO {
    /** 设备UUID。 */
    String id;
    /** 固定ONLINE。 */
    String status;
    /** 服务端ISO时间。 */
    String serverTime;
}
