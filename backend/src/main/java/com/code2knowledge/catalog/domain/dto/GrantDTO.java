package com.code2knowledge.catalog.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 系统目录读取授权请求，仅接受catalog.read；不授予知识或源权限。 */
@Getter
@Setter
public class GrantDTO {
    /** 同企业普通成员UUID，不为空。 */
    private String memberId;
}
