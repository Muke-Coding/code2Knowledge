package com.code2knowledge.source.domain.dto;

import lombok.Getter;
import lombok.Setter;

/** 来源创建/编辑请求；不含企业、凭证或资料正文。 */
@Getter
@Setter
public class SaveSourceDTO {
    /** 来源名，1至120字符。 */
    private String name;
    /** 创建类型，编辑必须保持原类型。 */
    private String kind;
    /** Git无凭证地址或资料相对路径，非空。 */
    private String locator;
    /** 仓库分支必须明确选择；资料可null或空串。 */
    private String branch;
    /** 必须显式提交是否启用。 */
    private Boolean enabled;
    /** 编辑须当前版本，创建允许null或0。 */
    private Integer revision;
    /** 明确提交1至100个同企业系统ID，不能省略或重复。 */
    private java.util.List<String> systemIds;
}
