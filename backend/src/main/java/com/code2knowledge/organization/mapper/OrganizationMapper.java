package com.code2knowledge.organization.mapper;

import com.code2knowledge.organization.domain.dto.SaveDepartmentDTO;
import com.code2knowledge.organization.domain.vo.DepartmentVO;
import com.code2knowledge.organization.domain.vo.MemberDepartmentVO;
import com.code2knowledge.organization.domain.vo.DepartmentGrantVO;
import org.apache.ibatis.annotations.*;
import java.util.List;

/** 组织数据SQL契约；服务先持企业锁，变更、版本和审计同事务，无软删除或异步事件。 */
@Mapper
public interface OrganizationMapper {
    /**
     * @param tenant 当前企业
     * @return 最多501部门供服务执行容量门禁 */
    List<DepartmentVO> departments(@Param("tenant") String tenant);
    /**
     * @param tenant 当前会话企业UUID，不为空；只能由服务提供
     * @return 同企业成员主部门关联；无归属为空串，无成员为空列表，查询不加锁且不写事件
     */
    List<com.code2knowledge.organization.domain.vo.MemberDirectoryVO> directory(@Param("tenant") String tenant);
    /**
     * @param tenant 当前企业
     * @param id 新UUID
     * @param row 已核验部门配置 */
    void insert(@Param("tenant") String tenant,@Param("id") String id,@Param("row") SaveDepartmentDTO row);
    /**
     * @param tenant 当前企业
     * @param id 目标部门
     * @param row 当前版本配置
     * @return 更新数，0冲突 */
    int update(@Param("tenant") String tenant,@Param("id") String id,@Param("row") SaveDepartmentDTO row);
    /**
     * @param tenant 当前企业
     * @param id 无引用部门
     * @param revision 当前版本
     * @return 删除数，0冲突 */
    int delete(@Param("tenant") String tenant,@Param("id") String id,@Param("revision") int revision);
    /**
     * @param tenant 当前企业
     * @param id 部门
     * @return 子部门、成员与有效授权引用总数，不含已撤销墓碑 */
    int references(@Param("tenant") String tenant,@Param("id") String id);
    /**
     * @param tenant 当前企业
     * @param member 当前企业成员
     * @return 主部门与版本，无记录null */
    MemberDepartmentVO member(@Param("tenant") String tenant,@Param("member") String member);
    /**
     * @param tenant 当前企业
     * @param member 已验证成员
     * @param department 已验证部门，空串移除
     * @param revision 旧分配版本 */
    void assign(@Param("tenant") String tenant,@Param("member") String member,@Param("department") String department,@Param("revision") int revision);
    /**
     * @param tenant 当前企业
     * @param kind SYSTEM或SOURCE
     * @param resource 已核验资源
     * @return 当前部门授权及已撤销版本墓碑，无记录空列表 */
    List<DepartmentGrantVO> grants(@Param("tenant") String tenant,@Param("kind") String kind,@Param("resource") String resource);
    /**
     * @param tenant 当前企业
     * @param kind 固定资源类型
     * @param resource 已核验资源
     * @param input 已验证版本授权 */
    void grant(@Param("tenant") String tenant,@Param("kind") String kind,@Param("resource") String resource,@Param("input") com.code2knowledge.organization.domain.dto.DepartmentGrantDTO input);
    /**
     * @param tenant 当前企业
     * @param kind 固定类型
     * @param resource 资源
     * @param department 当前部门 */
    void revoke(@Param("tenant") String tenant,@Param("kind") String kind,@Param("resource") String resource,@Param("department") String department);
}
