package com.code2knowledge.candidate.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import com.code2knowledge.candidate.domain.entity.CandidateDO;
import com.code2knowledge.candidate.domain.dto.CandidateSourceDTO;
import java.util.List;

/** 私有候选持久化；SQL仅XML，事务由服务控制；授权写入先锁企业，不提供软删除、审核或事件投递。 */
@Mapper
public interface CandidateMapper {
    /**
     * @param tenant 企业UUID
     * @param owner 导入者UUID
     * @param id 候选UUID
     * @return 本人候选，不存在null */
    CandidateDO get(@Param("tenant") String tenant, @Param("owner") String owner, @Param("id") String id);
    /**
     * @param tenant 企业UUID
     * @param owner 导入者UUID
     * @param request 幂等UUID
     * @return 同请求历史结果，无则null */
    CandidateDO request(@Param("tenant") String tenant, @Param("owner") String owner, @Param("request") String request);
    /**
     * @param tenant 企业UUID
     * @param owner 导入者UUID
     * @param offset 起始记录
     * @return 当前全部来源仍有效的分页 */
    List<CandidateDO> list(@Param("tenant") String tenant, @Param("owner") String owner, @Param("offset") int offset);
    /**
     * @param tenant 企业UUID
     * @param owner 导入者UUID
     * @return 当前来源有效候选数量 */
    int count(@Param("tenant") String tenant, @Param("owner") String owner);
    /** @param value 不可变候选元数据 */
    void insert(@Param("value") CandidateDO value);
    /**
     * @param id 候选UUID
     * @param tenant 企业UUID
     * @param source 明确来源与版本映射 */
    void source(@Param("id") String id, @Param("tenant") String tenant, @Param("source") CandidateSourceDTO source);
    /**
     * @param id 本人候选UUID
     * @return 全部原始来源绑定，不自动改为最新版本 */
    List<CandidateSourceDTO> sources(@Param("id") String id);
}
