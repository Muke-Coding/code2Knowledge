package com.code2knowledge.task.domain.dto;

import lombok.Data;

/** 多仓库和资料逆向请求；模型、端点及凭证不属于Web契约。 */
@Data
public class AnalysisCreateDTO {
    /** 任务名称，1至120字符。 */
    private String name;
    /** 产品稳定slug，80字符内。 */
    private String product;
    /** 业务域稳定slug，80字符内。 */
    private String domain;
    /** 本次业务分析范围，1至2000字符，不是执行命令。 */
    private String scope;
    /** 必须显式INCLUDE或NONE，不由空数组猜测资料选择。 */
    private String documentsChoice;
    /** 1至16个来源，至少一个代码仓库；资料选择须一致。 */
    private java.util.List<AnalysisSourceDTO> sources;
    /** 本人有效私有设备UUID。 */
    private String deviceId;
    /** 创建幂等UUID，输入变化不得复用。 */
    private String requestId;
}
