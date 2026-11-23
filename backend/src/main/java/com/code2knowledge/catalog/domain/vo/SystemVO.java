package com.code2knowledge.catalog.domain.vo;

import lombok.Value;

/** 当前有目录读取资格的系统元数据，不代表来源或知识阅读授权。 */
@Value
public class SystemVO {
    /** 系统UUID，不为空。 */
    String id;
    /** 系统名称，不为空。 */
    String name;
    /** 描述，允许空字符串。 */
    String description;
}
