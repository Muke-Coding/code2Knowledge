package com.code2knowledge.task.domain.entity;

import lombok.Data;

/** 逆向不可变请求事实；不保存模型或本机目录。 */
@Data
public class AnalysisSpecDO {
    /** 关联的私有任务UUID。 */
    private String taskId;
    /** 固定产品slug。 */
    private String product;
    /** 固定业务域slug。 */
    private String domain;
    /** 固定业务分析范围。 */
    private String scope;
    /** 显式资料选择，INCLUDE或NONE。 */
    private String documentsChoice;
}
