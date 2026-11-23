package com.code2knowledge.runtime.controller;

import com.code2knowledge.runtime.service.RuntimeService;
import com.code2knowledge.runtime.domain.vo.*;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import java.util.List;

/** 浏览器私有设备管理入口；只有会话所有者可读/撤销，不隐式赋予管理员跨成员权限。 */
@RestController
@Profile("platform")
@RequiredArgsConstructor
@RequestMapping("/api/v1/devices")
public class DeviceController {
    /** 私有设备应用服务，不直接访问DO或Mapper。 */
    private final RuntimeService runtime;
    /** @return 当前会话私有设备，GET无副作用无需CSRF；401身份失效，不含凭证 */
    @GetMapping
    public List<DeviceVO> list() { return runtime.list(); }
    /** @return 新5分钟单次配对码，需会话和CSRF；201成功，401失效；重新创建使旧待兑码失效 */
    @PostMapping("/pairings")
    @ResponseStatus(HttpStatus.CREATED)
    public PairingVO pairing() { return runtime.pair(); }
    /**
     * 撤销所有者设备，需会话和CSRF；204幂等成功、401失效、404无权或不存在；不能恢复。
     * @param id 设备UUID，不为空
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable String id) { runtime.revoke(id); }
}
