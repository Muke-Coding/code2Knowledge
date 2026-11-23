package com.code2knowledge.runtime.domain.entity;

import lombok.Getter;
import lombok.Setter;

/** 短期配对持久化事实，原码仅创建时返回；消费时行锁保证单次。 */
@Getter
@Setter
public class PairingDO {
    /** 配对UUID，不为空。 */
    private String id;
    /** 企业UUID，不为空。 */
    private String tenantId;
    /** 所有者UUID，不为空。 */
    private String ownerId;
    /** 高熵配对码SHA256，不存原码。 */
    private String codeHash;
    /** 创建时账户认证版本，账户启停后不可兑换。 */
    private int ownerVersion;
}
