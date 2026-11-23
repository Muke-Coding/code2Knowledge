package com.code2knowledge.authorization.mapper;

import com.code2knowledge.authorization.domain.entity.RoleDO;
import com.code2knowledge.authorization.domain.vo.PermissionVO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/** 授权持久化契约；业务SQL仅XML。服务写事务先锁企业，再核验当前动作，串行化授权变更与受控业务写入；无软删除或事件投递。 */
@Mapper
public interface AuthorizationMapper {
    /**
     *
     * @param tenantId 可信企业UUID，不为空
     *
     * @return 持有至事务结束的企业ID，不存在为null */
    String lockTenant(@Param("tenantId") String tenantId);
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param memberId 有效成员UUID
     *
     * @return 当前内置与自定义角色并集动作，空表示无权 */
    List<String> effective(@Param("tenantId") String tenantId, @Param("memberId") String memberId);
    /**
     * @return 已实现动作目录，空列表表示未配置 */
    List<PermissionVO> permissions();
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @return 同企业及内置角色，不返回外企业 */
    List<RoleDO> roles(@Param("tenantId") String tenantId);
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param id 角色ID
     *
     * @return 当前企业或内置角色，不存在为null */
    RoleDO role(@Param("tenantId") String tenantId, @Param("id") String id);
    /**
     *
     * @param id 已经校验归属的角色ID
     *
     * @return 该角色动作，空表示无额外动作 */
    List<String> rolePermissions(@Param("id") String id);
    /**
     * @param role 同企业新自定义角色，不为空 */
    void insertRole(@Param("role") RoleDO role);
    /**
     *
     * @param role 已校验同企业角色及最新版本，不为空
     *
     * @return 变更条数，0表示冲突 */
    int updateRole(@Param("role") RoleDO role);
    /**
     * @param id 已校验且非内置角色ID */
    void clearPermissions(@Param("id") String id);
    /**
     *
     * @param id 已校验非内置角色ID
     *
     * @param code 已实现动作码 */
    void addPermission(@Param("id") String id, @Param("code") String code);
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param id 非内置角色ID
     *
     * @return 当前引用数，0表示可删除 */
    int assignedCount(@Param("tenantId") String tenantId, @Param("id") String id);
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param id 非内置角色ID
     *
     * @return 删除条数，0表示不存在 */
    int deleteRole(@Param("tenantId") String tenantId, @Param("id") String id);
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param memberId 同企业普通成员UUID
     *
     * @return 已分配自定义角色ID，空表示无额外角色 */
    List<String> memberRoles(@Param("tenantId") String tenantId, @Param("memberId") String memberId);
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param memberId 同企业普通成员UUID
     *
     * @return 当前分配版本，不存在为null */
    Integer memberRevision(@Param("tenantId") String tenantId, @Param("memberId") String memberId);
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param memberId 同企业普通成员UUID */
    void clearMemberRoles(@Param("tenantId") String tenantId, @Param("memberId") String memberId);
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param memberId 同企业普通成员UUID
     *
     * @param roleId 同企业自定义角色UUID */
    void addMemberRole(@Param("tenantId") String tenantId, @Param("memberId") String memberId, @Param("roleId") String roleId);
    /**
     *
     * @param tenantId 可信企业UUID
     *
     * @param memberId 同企业普通成员UUID
     *
     * @param revision 期望版本，非负
     *
     * @return 更新条数，0表示冲突 */
    int bumpMemberRevision(@Param("tenantId") String tenantId, @Param("memberId") String memberId, @Param("revision") int revision);
}
