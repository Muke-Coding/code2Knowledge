package com.code2knowledge.authorization.domain.vo;
import lombok.Value;
/** 只读注册页面与当前企业显示配置；字段不允许改变服务端授权动作。 */
@Value
public class MenuSettingVO {
    /** 固定注册路径。 */
    String path;
    /** 当前显示名称。 */
    String title;
    /** 固定组标识。 */
    String group;
    /** 固定组显示名称。 */
    String groupTitle;
    /** 固定读取动作，不因隐藏而撤销。 */
    String permission;
    /** 显示排序。 */
    int sortOrder;
    /** 是否显示导航入口。 */
    boolean visible;
    /** 当前乐观版本。 */
    int revision;
}
