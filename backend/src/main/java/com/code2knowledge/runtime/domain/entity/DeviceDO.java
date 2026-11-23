package com.code2knowledge.runtime.domain.entity;

import lombok.Getter;
import lombok.Setter;

/** 设备持久化事实，仅服务与Mapper使用；摘要不得返回浏览器。 */
@Getter
@Setter
public class DeviceDO {
    /** 设备UUID，不为空。 */
    private String id;
    /** 企业UUID，不为空。 */
    private String tenantId;
    /** 所有者身份UUID，不为空。 */
    private String ownerId;
    /** 设备名称，不为空。 */
    private String name;
    /** 自报OS，只用于展示。 */
    private String os;
    /** 自报架构，只用于展示。 */
    private String arch;
    /** 协议客户端版本，不为空。 */
    private String version;
    /** 设备凭证SHA256摘要，不存明文。 */
    private String tokenHash;
    /** 配对时账户认证版本，启停后设备凭证失效。 */
    private int ownerVersion;
    /** 是否撤销，撤销不可恢复。 */
    private boolean revoked;
}
