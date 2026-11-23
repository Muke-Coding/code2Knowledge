package com.code2knowledge.catalog.mapper;

import com.code2knowledge.catalog.domain.entity.SystemDO;
import com.code2knowledge.catalog.domain.vo.SystemVO;
import com.code2knowledge.catalog.domain.vo.GrantVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/** 目录和读取授权持久化契约；事务由服务控制，企业过滤在每条SQL中实施，无软删除、事件或隐式内容授权。 */
@Mapper
public interface CatalogMapper {
    /**
     * @param tenantId 可信企业UUID，不为空
     * @param userId 当前身份UUID，不为空
     * @param admin 是否具有当前catalog.read.all动作，不能按角色名推断
     * @return 有资格列出的目录，不为空 */
    List<SystemVO> list(@Param("tenantId") String tenantId, @Param("userId") String userId, @Param("admin") boolean admin);
    /**
     * @param tenantId 可信企业UUID，不为空
     * @param id 系统UUID，不为空
     * @param userId 当前身份UUID，不为空
     * @param admin 当前catalog.read.all动作判定，不是ADMIN身份判断
     * @return 授权目录，不存在或不可见为null */
    SystemVO find(@Param("tenantId") String tenantId, @Param("id") String id, @Param("userId") String userId, @Param("admin") boolean admin);
    /** @param system 新系统元数据，不为空 */
    void insert(@Param("system") SystemDO system);
    /**
     * @param tenantId 可信企业UUID，不为空
     * @param systemId 系统UUID，不为空
     * @return 当前读取授权列表，不为空 */
    List<GrantVO> grants(@Param("tenantId") String tenantId, @Param("systemId") String systemId);
    /**
     * @param tenantId 企业UUID，不为空
     * @param systemId 同企业系统UUID，不为空
     * @param memberId 同企业身份UUID，不为空
     * @return 插入数，重复授权为0 */
    int grant(@Param("tenantId") String tenantId, @Param("systemId") String systemId, @Param("memberId") String memberId);
    /**
     * @param tenantId 企业UUID，不为空
     * @param systemId 同企业系统UUID，不为空
     * @param memberId 同企业身份UUID，不为空
     * @return 删除数，无既有授权为0 */
    int revoke(@Param("tenantId") String tenantId, @Param("systemId") String systemId, @Param("memberId") String memberId);
}
