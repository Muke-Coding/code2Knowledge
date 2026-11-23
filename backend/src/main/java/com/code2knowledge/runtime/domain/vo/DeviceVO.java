package com.code2knowledge.runtime.domain.vo;

import lombok.Value;

/** 所有者私有设备视图；心跳只代表接入状态，不代表任务执行可用。 */
@Value
public class DeviceVO {
    /** 设备UUID，不为空。 */
    String id;
    /** 设备名称，不为空。 */
    String name;
    /** 自报OS，不为空。 */
    String os;
    /** 自报架构，不为空。 */
    String arch;
    /** 协议版本，不为空。 */
    String version;
    /** ONLINE/OFFLINE/REVOKED，禁用和撤销优先。 */
    String status;
    /** 最近心跳ISO时间，无心跳为空字符串。 */
    String lastSeen;
}
