package com.code2knowledge.identity.mapper;

import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.identity.domain.entity.TenantDO;
import com.code2knowledge.identity.domain.vo.MemberVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/** 身份持久化契约；SQL仅在XML；调用方服务拥有事务，写操作与审计同事务提交，无软删除与事件投递。 */
@Mapper
public interface IdentityMapper {
    /**
     * @param username 部署内登录名，不为空
     * @return 对应账户，不存在为null */
    AccountDO findByUsername(@Param("username") String username);
    /**
     * @param id 身份UUID，不为空
     * @return 对应账户，不存在为null */
    AccountDO findById(@Param("id") String id);
    /**
     * @param id 企业UUID，不为空
     * @return 企业，不存在为null */
    TenantDO findTenant(@Param("id") String id);
    /** @return 已有企业数量，不为空 */
    int countTenants();
    /** @param tenant 新企业，不为空 */
    void insertTenant(@Param("tenant") TenantDO tenant);
    /** @param account 新账户，不为空；唯一冲突由数据库拒绝 */
    void insertAccount(@Param("account") AccountDO account);
    /**
     * @param tenantId 可信企业UUID，不为空
     * @return 企业成员，空列表表示无人 */
    List<MemberVO> listMembers(@Param("tenantId") String tenantId);
    /**
     * @param tenantId 可信企业UUID，不为空
     * @param id 普通成员UUID，不为空
     * @param enabled 是否启用
     * @return 更新条数，0表示非同企业普通成员 */
    int setEnabled(@Param("tenantId") String tenantId, @Param("id") String id, @Param("enabled") boolean enabled);
    /**
     * @param tenantId 企业UUID，不为空
     * @param actorId 操作者UUID，不为空
     * @param event 事件类型，不含凭证
     * @param targetId 目标UUID，不为空 */
    void audit(@Param("tenantId") String tenantId, @Param("actorId") String actorId, @Param("event") String event, @Param("targetId") String targetId);
    /**
     * @param tenantId 企业UUID，不为空
     * @param actorId 具有对应资源管理动作的操作者UUID，不为空
     * @param event 授予或撤销事件，不为空
     * @param systemId 目录或来源资源UUID，不为空；事件类型区分领域
     * @param memberId 被授权成员UUID，不为空 */
    void auditPermission(@Param("tenantId") String tenantId, @Param("actorId") String actorId, @Param("event") String event, @Param("systemId") String systemId, @Param("memberId") String memberId);
    /**
     * @param id 已知账户UUID，不为空
     * @return 当前账户并持行锁到事务结束，不存在为null */
    AccountDO lockById(@Param("id") String id);
}
