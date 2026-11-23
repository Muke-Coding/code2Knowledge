package com.code2knowledge.source.domain.entity;

import lombok.Getter;
import lombok.Setter;

/** 来源持久化对象；不得携带Git凭证、资料正文或运行时绝对目录。 */
@Getter
@Setter
public class SourceDO {
    /** 稳定来源UUID，不随名称或定位变化。 */
    private String id;
    /** 可信企业UUID。 */
    private String tenantId;
    /** 来源显示名，1至120字符。 */
    private String name;
    /** REPOSITORY或DOCUMENT；创建后不可改变。 */
    private String kind;
    /** 无凭证Git地址或运行时资料根目录下的相对路径，不读取正文。 */
    private String locator;
    /** 仓库默认分析分支；资料为空字符串。 */
    private String branch;
    /** 是否允许授予及检查分析资格。 */
    private boolean enabled;
    /** 来源配置版本；变化使旧资源授权失效。 */
    private int revision;
}
