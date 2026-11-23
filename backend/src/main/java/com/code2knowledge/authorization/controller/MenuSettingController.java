package com.code2knowledge.authorization.controller;
import com.code2knowledge.authorization.service.MenuSettingService;
import com.code2knowledge.authorization.domain.dto.MenuSettingDTO;
import com.code2knowledge.authorization.domain.vo.MenuSettingVO;
import org.springframework.web.bind.annotation.*;
import org.springframework.context.annotation.Profile;
import lombok.RequiredArgsConstructor;
import java.util.List;
/** 菜单显示管理HTTP入口；会话身份、写入CSRF，不允许修改固定权限与路由。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/api/v1/menus")
public class MenuSettingController {
    /** 企业锁内版本控制与审计服务。 */
    private final MenuSettingService service;
    /**
     * @return 所有注册显示项；menu.read，401身份/403动作，GET无副作用 */
    @GetMapping
    public List<MenuSettingVO> list() { return service.list(); }
    /**
     * @param key 固定页面key
     * @param input 名称分组排序显示及版本
     * @return 更新结果；menu.update与CSRF，400字段/403动作/404路由/409冲突，写入显示覆盖与审计 */
    @PutMapping("/{key}")
    public MenuSettingVO update(@PathVariable String key,@RequestBody MenuSettingDTO input) { return service.update(key,input); }
}
