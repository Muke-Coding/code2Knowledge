package com.code2knowledge.catalog.domain.vo;

import lombok.Value;

/** 系统目录读取授权视图，供管理员查看和撤销。 */
@Value
public class GrantVO {
    /** 被授权成员UUID，不为空。 */
    String memberId;
    /** 当前成员显示名称，不为空。 */
    String displayName;
    /** 固定catalog.read，仅目录元数据。 */
    String action;
}
