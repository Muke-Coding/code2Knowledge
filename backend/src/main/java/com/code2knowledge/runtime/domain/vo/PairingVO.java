package com.code2knowledge.runtime.domain.vo;

import lombok.Value;

/** 配对资料仅创建时返回原码，日志及审计禁止保存code。 */
@Value
public class PairingVO {
    /** 配对UUID，不为空。 */
    String id;
    /** 单次256位原码，不记录，禁止命令参数。 */
    String code;
    /** 5分钟有效期ISO时间。 */
    String expiresAt;
}
