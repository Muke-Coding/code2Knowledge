package com.code2knowledge.catalog.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 管理员登记系统元数据的请求，不隐式创建仓库或知识。 */
@Getter
@Setter
public class CreateSystemDTO {
    /** 系统名称，1到120字符，不为空。 */
    private String name;
    /** 描述，最多500字符，null视为空字符串。 */
    private String description;
}
