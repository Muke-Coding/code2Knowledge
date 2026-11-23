package com.code2knowledge.runtime.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 设备兑换配对请求，不允许自选企业或所有者；原码仅经TLS或回环传送。 */
@Getter
@Setter
public class RedeemDTO {
    /** 256位配对码，必填，单次且5分钟有效，不记录。 */
    private String code;
    /** 设备展示名称，1到80字符。 */
    private String name;
    /** 自报OS，1到32位ASCII标识，不作为可信证明。 */
    private String os;
    /** 自报架构，1到32位ASCII标识。 */
    private String arch;
    /** 协议版本，本轮仅1。 */
    private String version;
}
