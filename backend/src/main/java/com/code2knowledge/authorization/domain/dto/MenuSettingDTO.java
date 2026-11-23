package com.code2knowledge.authorization.domain.dto;
import lombok.Data;
/** 当前企业受控菜单配置；不能提交路由、组件、权限码或脚本。 */
@Data
public class MenuSettingDTO {
    /** 显示名称，1至40字符。 */
    private String title;
    /** knowledge、runtime、device或enterprise，不能新增任意分组。 */
    private String group;
    /** 组内显示排序，0至9999。 */
    private Integer sortOrder;
    /** 只影响导航入口，不撤销动作与对象权限。 */
    private Boolean visible;
    /** 当前版本，首次默认配置为0。 */
    private Integer revision;
}
