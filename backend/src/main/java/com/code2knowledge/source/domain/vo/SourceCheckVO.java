package com.code2knowledge.source.domain.vo;

import lombok.Value;

/** 来源分析资格核对，不执行Git、文件或模型，不创建逆向任务。 */
@Value
public class SourceCheckVO {
    /** 已核对来源UUID。 */
    String sourceId;
    /** 本次检查的配置版本。 */
    int revision;
    /** 本次资格检查通过；不是授权票据，任务执行必须重新检查。 */
    boolean allowed;
}
