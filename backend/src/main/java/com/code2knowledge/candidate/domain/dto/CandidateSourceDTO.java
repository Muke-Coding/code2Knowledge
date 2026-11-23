package com.code2knowledge.candidate.domain.dto;

import lombok.Data;

/** 候选来源绑定传输契约；将包内声明的仓库和commit对应到平台来源配置，仅用于当前授权校验，不证明源码取证真实完成。 */
@Data
public class CandidateSourceDTO {
    /** code或document，旧导入省略时兼容code。 */
    private String kind = "code";
    /** 资料根内路径；代码为空，旧导入省略时兼容空。 */
    private String path = "";
    /** 平台来源UUID。 */
    private String sourceId;
    /** 当前配置版本，不允许null。 */
    private Integer revision;
    /** Skill来源标识，不能自动当作权限。 */
    private String repository;
    /** 代码完整commit；资料为原始文件SHA256。 */
    private String commit;
}
