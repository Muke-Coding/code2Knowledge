package com.code2knowledge.authorization.domain.vo;

import lombok.Value;

/** 服务端按当前页面动作过滤的导航项；不携带资源范围，前端不得自行补回隐藏页面。 */
@Value
public class NavigationVO {
    /** 唯一路由，如/sources。 */
    String path;
    /** 页面中文名称。 */
    String title;
    /** 所属目录稳定标识。 */
    String group;
    /** 目录中文名称。 */
    String groupTitle;
    /** 该页面入口的动作码。 */
    String permission;
    /** 只决定导航显示；隐藏不撤销当前角色动作或受保护路由资格。 */
    boolean visible;
}
