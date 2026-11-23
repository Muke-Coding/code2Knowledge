package com.code2knowledge.authorization.service;
import com.code2knowledge.authorization.domain.vo.MenuSettingVO;
import com.code2knowledge.authorization.domain.dto.MenuSettingDTO;
import com.code2knowledge.authorization.mapper.MenuSettingMapper;
import com.code2knowledge.authorization.constant.PermissionCodes;
import com.code2knowledge.identity.service.IdentityService;
import com.code2knowledge.identity.mapper.IdentityMapper;
import com.code2knowledge.identity.domain.entity.AccountDO;
import com.code2knowledge.common.exception.ApiException;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.annotation.Transactional;
import lombok.RequiredArgsConstructor;
import java.util.*;
/** 固定页面显示管理；改变导航不改变角色动作或API资格，企业锁及审计原子，无动态代码加载或外链。 */
@Service
@Profile("platform")
@RequiredArgsConstructor
public class MenuSettingService {
    /** 当前动作校验。 */
    private final IdentityService identity;
    /** 固定注册页面。 */
    private final PermissionCatalogService catalog;
    /** 只读写覆盖配置。 */
    private final MenuSettingMapper mapper;
    /** 同事务审计。 */
    private final IdentityMapper audit;
    /**
     * @return 本企业全部注册菜单含隐藏项
     * @throws ApiException 403菜单读取 */
    public List<MenuSettingVO> list() { AccountDO actor=identity.require(PermissionCodes.MENU_READ); return catalog.settings(actor.getTenantId()); }
    /**
     * @param key 固定路径去除前导斜杠，如systems，不接受组件或URL
     * @param input 明确显示配置
     * @return 更新配置
     * @throws ApiException 400字段、403动作、404非注册路径、409版本或隐藏菜单管理入口 */
    @Transactional
    public MenuSettingVO update(String key,MenuSettingDTO input) {
        AccountDO actor=identity.require(PermissionCodes.MENU_UPDATE); String path="/"+key; MenuSettingVO old=null;
        for(MenuSettingVO row:catalog.settings(actor.getTenantId()))if(row.getPath().equals(path))old=row;
        if(old==null)throw new ApiException(404,"NOT_FOUND","页面未注册");
        if(input==null || input.getRevision()==null || input.getVisible()==null || input.getSortOrder()==null || input.getSortOrder()<0 || input.getSortOrder()>9999)throw new ApiException(400,"INVALID_MENU","请明确菜单名称、分组、排序与显示状态");
        String title=IdentityService.text(input.getTitle(),40,"菜单名称"), groupTitle=groupTitle(input.getGroup());
        if(old.getRevision()!=input.getRevision())throw new ApiException(409,"MENU_CHANGED","菜单已变化，请重新加载");
        if("/menus".equals(path) && (!input.getVisible() || !"enterprise".equals(input.getGroup())))throw new ApiException(409,"MENU_PROTECTED","菜单管理入口必须保留在系统设置，避免无法恢复配置");
        MenuSettingVO row=new MenuSettingVO(path,title,input.getGroup(),groupTitle,old.getPermission(),input.getSortOrder(),input.getVisible(),old.getRevision()+1);
        mapper.save(actor.getTenantId(),row);audit.audit(actor.getTenantId(),actor.getId(),"menu.updated",path);return row;
    }
    /**
     * @param group 固定组标识
     * @return 不允许任意创建组的显示名
     * @throws ApiException 400未知组 */
    private String groupTitle(String group) { if("knowledge".equals(group))return "知识工作台";if("runtime".equals(group))return "逆向工作台";if("device".equals(group))return "设备管理";if("enterprise".equals(group))return "系统设置";throw new ApiException(400,"INVALID_MENU","不支持此分组"); }
}
