package com.code2knowledge.organization.service;

import com.code2knowledge.organization.mapper.OrganizationMapper;
import com.code2knowledge.organization.domain.dto.*;
import com.code2knowledge.organization.domain.vo.*;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.source.mapper.SourceMapper;
import com.code2knowledge.source.domain.entity.SourceDO;
import com.code2knowledge.catalog.mapper.CatalogMapper;
import com.code2knowledge.authorization.constant.PermissionCodes;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.*;

/** 部门、主归属及显式资源授权；所有变更先持企业锁，与审计同事务，无软删除、权限缓存或事件投递。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class OrganizationService {
    /** 每请求当前动作与企业锁，不接受客户端企业。 */
    private final IdentityService identity;
    /** 组织关系、版本与引用约束。 */
    private final OrganizationMapper mapper;
    /** 成员归属及同事务审计。 */
    private final IdentityMapper accounts;
    /** 来源归属及当前配置版本，不访问源码。 */
    private final SourceMapper sources;
    /** 目录元数据，不自动赋知识权限。 */
    private final CatalogMapper systems;

    /**
     * @return 本企业最多500项部门，空列表无默认部门
     * @throws ApiException 403动作或409容量 */
    public List<DepartmentVO> list() { AccountDO actor=identity.require(PermissionCodes.DEPARTMENT_READ); return tree(actor.getTenantId()); }
    /**
     * 用单次企业范围查询支持用户页部门筛选；只读重复读事务保证两项动作来自同一授权快照，不持写锁。
     * @return 当前企业成员到主部门的关联；无成员时空列表，无软删除恢复或事件投递
     * @throws ApiException 401身份无效，403缺少成员读取或部门读取；管理员不绕过动作核验
     */
    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public List<MemberDirectoryVO> directory() {
        AccountDO actor = identity.require(PermissionCodes.MEMBER_READ);
        identity.require(PermissionCodes.DEPARTMENT_READ);
        return mapper.directory(actor.getTenantId());
    }
    /**
     * @param id 新建为空串，否则目标UUID
     * @param input 明确配置及当前版本
     * @return 保存后部门
     * @throws ApiException 400输入或环、403动作、404对象、409版本/停用父级/容量 */
    @Transactional
    public DepartmentVO save(String id, SaveDepartmentDTO input) {
        AccountDO actor=identity.require(id.isEmpty()?PermissionCodes.DEPARTMENT_CREATE:PermissionCodes.DEPARTMENT_UPDATE);
        if(input==null || input.getParentId()==null || input.getSortOrder()==null || input.getEnabled()==null || input.getRevision()==null || input.getSortOrder()<0 || input.getSortOrder()>9999) invalid();
        input.setName(IdentityService.text(input.getName(),80,"部门名称")); List<DepartmentVO> rows=tree(actor.getTenantId());
        DepartmentVO old=id.isEmpty()?null:find(rows,id); if(!id.isEmpty() && old==null) missing();
        if(old!=null && old.getRevision()!=input.getRevision()) conflict();
        if(old==null && (rows.size()>=500 || input.getRevision()!=0)) conflict();
        String parent=input.getParentId(); Set<String> visited=new HashSet<>(); if(!id.isEmpty())visited.add(id);
        while(!parent.isEmpty()) { if(!visited.add(parent) || visited.size()>(id.isEmpty()?15:16)) invalid(); DepartmentVO next=find(rows,parent); if(next==null) missing(); if(input.getEnabled() && !next.isEnabled()) throw new ApiException(409,"DEPARTMENT_DISABLED","请先启用上级部门"); parent=next.getParentId(); }
        // 移动父节点须同时约束整棵子树深度，防止自身未超深却使下级超出授权递归上限。
        for(DepartmentVO row:rows) { int depth=0; String current=row.getId(); Set<String> path=new HashSet<>(); while(!current.isEmpty()) { if(!path.add(current) || ++depth>16) invalid(); if(current.equals(id)) current=input.getParentId(); else { DepartmentVO next=find(rows,current); if(next==null) missing(); current=next.getParentId(); } } }
        String target=id.isEmpty()?UUID.randomUUID().toString():id;
        if(old==null) mapper.insert(actor.getTenantId(),target,input); else if(mapper.update(actor.getTenantId(),id,input)!=1) conflict();
        accounts.audit(actor.getTenantId(),actor.getId(),old==null?"department.created":"department.updated",target);
        return find(tree(actor.getTenantId()),target);
    }
    /**
     * @param id 无子部门/成员/授权引用的部门
     * @param revision 最新版本
     * @throws ApiException 403动作、404目标、409引用或版本；物理删除不可恢复 */
    @Transactional
    public void delete(String id,int revision) { AccountDO actor=identity.require(PermissionCodes.DEPARTMENT_DELETE); DepartmentVO row=find(tree(actor.getTenantId()),id); if(row==null)missing(); if(row.getRevision()!=revision || mapper.references(actor.getTenantId(),id)>0)throw new ApiException(409,"DEPARTMENT_IN_USE","版本已变化或部门仍有子级、成员或资源授权，请先处理引用"); if(mapper.delete(actor.getTenantId(),id,revision)!=1)conflict(); accounts.audit(actor.getTenantId(),actor.getId(),"department.deleted",id); }
    /**
     * @param member 同企业成员
     * @return 主部门与独立版本，无归属为空串
     * @throws ApiException 403动作、404对象 */
    public MemberDepartmentVO member(String member) { AccountDO actor=identity.require(PermissionCodes.DEPARTMENT_ASSIGN); account(actor,member); MemberDepartmentVO value=mapper.member(actor.getTenantId(),member); return value==null?new MemberDepartmentVO("",0):value; }
    /**
     * @param member 同企业成员，含引导管理员；部门不改变基础身份
     * @param input 明确部门或空串及最新版本
     * @throws ApiException 400输入、403动作、404对象、409停用或版本；撤角色不由此接口执行 */
    @Transactional
    public void assign(String member,MemberDepartmentDTO input) {
        AccountDO actor=identity.require(PermissionCodes.DEPARTMENT_ASSIGN); account(actor,member);
        if(input==null || input.getDepartmentId()==null || input.getRevision()==null)invalid();
        MemberDepartmentVO old=mapper.member(actor.getTenantId(),member); int revision=old==null?0:old.getRevision(); if(revision!=input.getRevision())conflict();
        if(!input.getDepartmentId().isEmpty()) active(tree(actor.getTenantId()),input.getDepartmentId());
        if(old!=null && old.getDepartmentId().equals(input.getDepartmentId()))return;
        mapper.assign(actor.getTenantId(),member,input.getDepartmentId(),revision); accounts.audit(actor.getTenantId(),actor.getId(),"member.department_changed",member);
    }
    /**
     * @param kind SYSTEM目录或SOURCE分析
     * @param resource 资源UUID
     * @return 资源的部门授权，不是个人授权
     * @throws ApiException 403对应资源授权动作、404对象 */
    public List<DepartmentGrantVO> grants(String kind,String resource) { AccountDO actor=identity.require("SOURCE".equals(kind)?PermissionCodes.SOURCE_GRANT:PermissionCodes.CATALOG_GRANT); resource(actor,kind,resource); return mapper.grants(actor.getTenantId(),kind,resource); }
    /**
     * @param kind 固定SYSTEM或SOURCE
     * @param resource 当前企业资源
     * @param input 明确部门、下级选择与版本
     * @param allow true授予，false撤销
     * @throws ApiException 400缺选择、403资源授权动作、404对象、409版本或停用；与企业锁和审计同事务 */
    @Transactional
    public void permission(String kind,String resource,DepartmentGrantDTO input,boolean allow) {
        AccountDO actor=identity.require("SOURCE".equals(kind)?PermissionCodes.SOURCE_GRANT:PermissionCodes.CATALOG_GRANT); int current=resource(actor,kind,resource);
        if(input==null || input.getDepartmentId()==null || input.getIncludeChildren()==null || input.getSourceRevision()==null || input.getRevision()==null)invalid();
        List<DepartmentVO> rows=tree(actor.getTenantId()); if(find(rows,input.getDepartmentId())==null)missing(); if(allow) { active(rows,input.getDepartmentId()); if("SOURCE".equals(kind) && !sources.owned(actor.getTenantId(),resource).isEnabled()) throw new ApiException(409,"SOURCE_DISABLED","停用来源不能新增授权"); }
        DepartmentGrantVO old=null; for(DepartmentGrantVO grant:mapper.grants(actor.getTenantId(),kind,resource))if(grant.getDepartmentId().equals(input.getDepartmentId()))old=grant;
        if((old==null?0:old.getRevision())!=input.getRevision() || current!=input.getSourceRevision())conflict();
        if(allow) { if(old!=null && old.isActive() && old.getSourceRevision()==current && old.isIncludeChildren()==input.getIncludeChildren())return; mapper.grant(actor.getTenantId(),kind,resource,input); }
        else { if(old==null || !old.isActive())return; mapper.revoke(actor.getTenantId(),kind,resource,input.getDepartmentId()); }
        accounts.auditPermission(actor.getTenantId(),actor.getId(),allow?"department.resource_granted":"department.resource_revoked",resource,input.getDepartmentId());
    }
    /**
     * @param actor 当前主体
     * @param kind 固定资源类型
     * @param id 资源
     * @return 当前配置版本，目录为0
     * @throws ApiException 404对象、400类型、409停用来源 */
    private int resource(AccountDO actor,String kind,String id) { if("SOURCE".equals(kind)) { SourceDO row=sources.owned(actor.getTenantId(),id); if(row==null)missing(); return row.getRevision(); } if(!"SYSTEM".equals(kind))invalid(); if(systems.find(actor.getTenantId(),id,actor.getId(),true)==null)missing(); return 0; }
    /**
     * @param actor 当前企业身份
     * @param member 待分配成员
     * @throws ApiException 404跨企业或不存在 */
    private void account(AccountDO actor,String member) { AccountDO row=accounts.findById(member); if(row==null || !actor.getTenantId().equals(row.getTenantId()))missing(); }
    /**
     * @param tenant 可信企业
     * @return 容量受控部门列表
     * @throws ApiException 409超过支持容量 */
    private List<DepartmentVO> tree(String tenant) { List<DepartmentVO> rows=mapper.departments(tenant); if(rows.size()>500)conflict(); return rows; }
    /**
     * @param rows 企业树
     * @param id 目标UUID
     * @return 当前对象，不存在null */
    private DepartmentVO find(List<DepartmentVO> rows,String id) { for(DepartmentVO row:rows)if(row.getId().equals(id))return row; return null; }
    /**
     * @param rows 企业树
     * @param id 部门
     * @throws ApiException 404不存在、409任一祖先或自己停用 */
    private void active(List<DepartmentVO> rows,String id) { String current=id; Set<String> seen=new HashSet<>(); while(!current.isEmpty()) { if(!seen.add(current) || seen.size()>16)invalid(); DepartmentVO row=find(rows,current); if(row==null)missing(); if(!row.isEnabled())throw new ApiException(409,"DEPARTMENT_DISABLED","部门或上级已停用"); current=row.getParentId(); } }
    /**
     * @throws ApiException 400明确配置不合法 */
    private void invalid() { throw new ApiException(400,"INVALID_DEPARTMENT","请明确部门、上级、排序及授权选择，层级最多16层，不允许循环"); }
    /**
     * @throws ApiException 404隐藏对象 */
    private void missing() { throw new ApiException(404,"NOT_FOUND","部门、成员或资源不存在"); }
    /**
     * @throws ApiException 409版本或容量冲突 */
    private void conflict() { throw new ApiException(409,"ORGANIZATION_CONFLICT","配置已变化或达到容量上限，请重新加载"); }
}
