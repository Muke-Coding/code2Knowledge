package com.code2knowledge.organization.controller;

import com.code2knowledge.organization.service.OrganizationService;
import com.code2knowledge.organization.domain.dto.*;
import com.code2knowledge.organization.domain.vo.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import lombok.RequiredArgsConstructor;
import java.util.List;

/** 本企业组织管理HTTP入口；会话认证、写入CSRF，动作与数据范围在服务逐次核验，Controller不访问持久化。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
public class OrganizationController {
    /** 组织短事务编排，不执行模型或远端操作。 */
    private final OrganizationService service;
    /**
     * @return 当前企业部门；department.read，401身份/403动作，无副作用 */
    @GetMapping("/api/v1/departments")
    public List<DepartmentVO> list() { return service.list(); }
    /**
     * @param input 明确部门配置
     * @return 201新部门；department.create与CSRF，400输入/403动作/404父级/409冲突，写入审计 */
    @PostMapping("/api/v1/departments")
    @ResponseStatus(HttpStatus.CREATED)
    public DepartmentVO create(@RequestBody SaveDepartmentDTO input) { return service.save("",input); }
    /**
     * @param id 当前部门
     * @param input 最新版本配置
     * @return 更新后部门；department.update与CSRF，400循环/403动作/404对象/409冲突，立即影响部门授权范围 */
    @PutMapping("/api/v1/departments/{id}")
    public DepartmentVO update(@PathVariable String id,@RequestBody SaveDepartmentDTO input) { return service.save(id,input); }
    /**
     * @param id 目标部门
     * @param revision 当前版本
     * @throws com.code2knowledge.common.exception.ApiException department.delete与CSRF，403动作/404对象/409引用，204不可恢复删除并审计 */
    @DeleteMapping("/api/v1/departments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id,@RequestParam int revision) { service.delete(id,revision); }
    /**
     * 用户管理批量读取主部门关联，身份来自当前会话，必须同时具备member.read和department.read。
     * @return 当前企业最小关联列表；未分配部门为空串，不含凭证，无写入副作用；401身份失效、403任一动作缺失
     */
    @GetMapping("/api/v1/departments/member-directory")
    public List<MemberDirectoryVO> directory() { return service.directory(); }
    /**
     * @param id 同企业成员
     * @return 主部门与版本；department.assign，403动作/404对象，无写入 */
    @GetMapping("/api/v1/members/{id}/department")
    public MemberDepartmentVO member(@PathVariable String id) { return service.member(id); }
    /**
     * @param id 同企业成员
     * @param input 主部门或空串及版本
     * @throws com.code2knowledge.common.exception.ApiException department.assign与CSRF，400输入/403动作/404对象/409版本，204写入审计并即时改变部门范围 */
    @PutMapping("/api/v1/members/{id}/department")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void assign(@PathVariable String id,@RequestBody MemberDepartmentDTO input) { service.assign(id,input); }
    /**
     * @param kind SYSTEM或SOURCE
     * @param id 资源UUID
     * @return 部门授权；需catalog.grant或source.grant，403动作/404对象，无副作用 */
    @GetMapping("/api/v1/department-grants/{kind}/{id}")
    public List<DepartmentGrantVO> grants(@PathVariable String kind,@PathVariable String id) { return service.grants(kind,id); }
    /**
     * @param kind SYSTEM或SOURCE
     * @param id 当前资源
     * @param allow 授予或撤销
     * @param input 明确部门及包含下级选择
     * @throws com.code2knowledge.common.exception.ApiException 对应资源grant与CSRF，400输入/403动作/404对象/409版本，204授权变更与审计 */
    @PutMapping("/api/v1/department-grants/{kind}/{id}/{allow}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void permission(@PathVariable String kind,@PathVariable String id,@PathVariable boolean allow,@RequestBody DepartmentGrantDTO input) { service.permission(kind,id,input,allow); }
}
