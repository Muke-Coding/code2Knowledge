package com.code2knowledge.task.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;
import com.code2knowledge.task.domain.entity.AnalysisSpecDO;
import com.code2knowledge.task.domain.vo.AnalysisSourceVO;

/** 逆向定义持久化；服务企业锁短事务内使用，与任务创建原子，无正文、密钥或消息投递。 */
@Mapper
public interface AnalysisMapper {
    /**
     * @param id 已核归属任务UUID
     * @return 不可变定义；预检任务null */
    AnalysisSpecDO spec(@Param("id") String id);
    /** @param spec 已授权固定请求 插入与任务同事务，无独立提交 */
    void insert(@Param("spec") AnalysisSpecDO spec);
    /**
     * @param id 已核归属任务UUID
     * @param source 固定来源快照 插入同事务全部来源 */
    void source(@Param("id") String id, @Param("source") AnalysisSourceVO source);
    /**
     * @param id 已核归属任务UUID
     * @return 按别名排序的全部来源，不从当前配置补猜历史 */
    List<AnalysisSourceVO> sources(@Param("id") String id);
    /**
     * @param id 当前有效尝试UUID
     * @return 该尝试已提交的候选ID；无则null，仅幂等比较使用 */
    String candidate(@Param("id") String id);
}
