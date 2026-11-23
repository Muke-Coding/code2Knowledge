package com.code2knowledge.source.domain.vo;

import lombok.Value;

/** 来源公开元数据；普通成员仅见已授权来源，不返回隐藏系统关联。 */
@Value
public class SourceVO {
    /** 来源稳定UUID。 */
    String id;
    /** 来源显示名。 */
    String name;
    /** 仓库或资料类型。 */
    String kind;
    /** 无凭证地址或运行时相对路径，仅登记未访问。 */
    String locator;
    /** 仓库默认分支，资料为空。 */
    String branch;
    /** 当前启用状态。 */
    boolean enabled;
    /** 当前配置版本，非负。 */
    int revision;
    /** 当前主体同时有动作和本版本资源授权；不证明文件/Git可访问。 */
    boolean canAnalyze;
}
