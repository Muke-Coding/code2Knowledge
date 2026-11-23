package com.code2knowledge.organization.domain.vo;

import lombok.Value;

/** 当前企业部门树平铺事实，不含跨企业身份或凭证。 */
@Value
public class DepartmentVO {
    /** 部门UUID，不为空。 */
    String id;
    /** 上级UUID，根为空字符串。 */
    String parentId;
    /** 同级唯一名称。 */
    String name;
    /** 升序显示顺序。 */
    int sortOrder;
    /** 当前部门启用状态，停用不授予部门资源。 */
    boolean enabled;
    /** 当前乐观版本。 */
    int revision;
}
