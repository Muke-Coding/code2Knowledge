package com.code2knowledge.candidate.domain.vo;

import lombok.Value;

/** 私有候选列表响应；仅输出本人当前可读的不可变版本摘要，不包含底层对象键、租户或其他导入者信息。 */
@Value
public class CandidateVO {
    /** 候选UUID。 */
    String id;
    /** 知识版本指纹，不是正式发布版本。 */
    String digest;
    /** 原始包字节数。 */
    long archiveBytes;
    /** 接收时间。 */
    String createdAt;
    /** IMPORTED为既有包导入，EXECUTED为当前租约执行回传；均未审核或发布。 */
    String mode;
}
