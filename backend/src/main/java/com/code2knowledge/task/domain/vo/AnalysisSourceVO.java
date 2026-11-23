package com.code2knowledge.task.domain.vo;

import lombok.Value;

/** 逆向来源快照；仅本人及设备协议使用，当前授权仍须逐次重查。 */
@Value
public class AnalysisSourceVO {
    /** 平台来源UUID。 */
    String sourceId;
    /** 创建时来源配置版本。 */
    int revision;
    /** 本次唯一材料标识。 */
    String alias;
    /** REPOSITORY或DOCUMENT，取服务器来源事实。 */
    String kind;
    /** 创建时明确分支；资料为空。 */
    String branch;
    /** 资料根内相对定位；代码为空，不上传远端凭证或本机绝对路径。 */
    String locator;
}
