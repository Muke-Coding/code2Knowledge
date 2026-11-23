package com.code2knowledge.authorization.service;

import com.code2knowledge.authorization.domain.vo.NavigationVO;
import com.code2knowledge.common.exception.ApiException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import java.io.InputStream;
import java.util.List;
import java.util.ArrayList;

/** 固定授权目录与企业导航读取；JSON决定角色动作和注册页面，数据库仅覆盖显示配置，本服务不写库、不授予资源或所有者范围。 */
@Service
@Profile("platform")
public class PermissionCatalogService {
    /** 启动时固定源目录，变更须随版本发布且通过契约一致性检查。 */
    private final JsonNode catalog;
    /** 企业显示覆盖；源目录仍决定路由及动作，避免菜单配置变成授权后门。 */
    private final com.code2knowledge.authorization.mapper.MenuSettingMapper settings;
    /**
     * 加载随制品分发的授权目录，失败阻止启动，禁止退回全开放导航。
     *
     *
     * @param settings 企业显示覆盖Mapper，不为空；不决定动作资格
     * @param json Spring结构解析器，不为空
     *
     *
     * @throws java.io.IOException 目录缺失或损坏
     */
    public PermissionCatalogService(ObjectMapper json, com.code2knowledge.authorization.mapper.MenuSettingMapper settings) throws java.io.IOException {
        this.settings=settings;
        try (InputStream input = new ClassPathResource("permission-catalog.json").getInputStream()) { catalog = json.readTree(input); }
    }
    /**
     * 按当前动作构建可达页面；目录分组不赋权，不存在自动管理员通配。
     *
     *
     * @param permissions 当前有效动作列表，不为空
     *
     * @param tenant 当前可信企业，不为空
     *
     *
     * @return 已过滤且保持目录顺序的导航，无页面时空列表
     */
    public List<NavigationVO> navigation(List<String> permissions,String tenant) {
        List<NavigationVO> result=new ArrayList<>();
        for(com.code2knowledge.authorization.domain.vo.MenuSettingVO menu:settings(tenant))if(permissions.contains(menu.getPermission()))result.add(new NavigationVO(menu.getPath(),menu.getTitle(),menu.getGroup(),menu.getGroupTitle(),menu.getPermission(),menu.isVisible()));
        return result;
    }
    /**
     * @param tenant 当前可信企业
     * @return 全部注册页面覆盖后配置；无覆盖使用默认，不接受任意数据库路径 */
    public List<com.code2knowledge.authorization.domain.vo.MenuSettingVO> settings(String tenant) {
        List<com.code2knowledge.authorization.domain.vo.MenuSettingVO> result=new ArrayList<>(), overrides=settings.list(tenant);int order=0;
        for(JsonNode menu:catalog.path("menus")) {
            com.code2knowledge.authorization.domain.vo.MenuSettingVO selected=null;
            for(com.code2knowledge.authorization.domain.vo.MenuSettingVO row:overrides)if(row.getPath().equals(menu.path("path").asText()))selected=row;
            result.add(new com.code2knowledge.authorization.domain.vo.MenuSettingVO(menu.path("path").asText(),selected==null?menu.path("title").asText():selected.getTitle(),selected==null?menu.path("group").asText():selected.getGroup(),selected==null?menu.path("groupTitle").asText():selected.getGroupTitle(),menu.path("permission").asText(),selected==null?order:selected.getSortOrder(),selected==null || selected.isVisible(),selected==null?0:selected.getRevision()));
            order++;
        }
        result.sort(java.util.Comparator.comparingInt(com.code2knowledge.authorization.domain.vo.MenuSettingVO::getSortOrder).thenComparing(com.code2knowledge.authorization.domain.vo.MenuSettingVO::getPath));return result;
    }
    /**
     * 拒绝缺少基础读取/来源资格的悬空操作；依赖不是隐式赠予，用户必须显式确认整组动作。
     *
     *
     * @param permissions 显式授权动作，不为空，未知动作由调用服务先拒绝
     *
     *
     * @throws ApiException 任一必要前置未选时400，不写入不完整角色
     */
    public void validate(List<String> permissions) {
        for (String code : permissions) for (JsonNode dependency : catalog.path("dependencies").path(code)) if (!permissions.contains(dependency.asText())) throw new ApiException(400, "PERMISSION_DEPENDENCY", "所选操作缺少前置权限：" + dependency.asText());
    }
}
