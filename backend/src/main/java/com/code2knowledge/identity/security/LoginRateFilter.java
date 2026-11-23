package com.code2knowledge.identity.security;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.Map;
import java.util.LinkedHashMap;

/** 单节点登录、解锁、改密与设备配对限速；按直连IP每分钟最多20次，解锁和改密另按当前账户限速，不信任转发头，不替代企业网关限速。 */
public class LoginRateFilter extends OncePerRequestFilter {
    /** 有界时间窗，避免任意IP造成无限内存增长；单进程重启会重置。 */
    private final Map<String, long[]> windows = new LinkedHashMap<>();
    /**
     * 拒绝超限登录、配对、改密和解锁；不读取或记录提交的密码，其他请求直接放行。
     *
     * @param request 当前HTTP请求，不为空
     *
     * @param response 当前HTTP响应，不为空
     *
     * @param chain 后续安全过滤链，不为空
     *
     * @throws ServletException 过滤链处理失败时抛出
     *
     * @throws IOException 响应写入失败时抛出
     */
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        // 使用去掉部署上下文的请求路径，兼容DispatcherServlet映射；不依赖容器拆分的servletPath/pathInfo。
        String path=request.getRequestURI().substring(request.getContextPath().length());
        boolean passwordAction="/api/v1/auth/unlock".equals(path) || "/api/v1/profile/password".equals(path);
        boolean limited="POST".equals(request.getMethod()) && (passwordAction || "/api/v1/auth/login".equals(path) || "/runtime/v1/pair".equals(path));
        Authentication authentication=SecurityContextHolder.getContext().getAuthentication();
        boolean allowed=true;
        if(limited) {
            allowed=allow("ip:"+request.getRemoteAddr(),System.currentTimeMillis());
            if(allowed && passwordAction && authentication!=null && authentication.getPrincipal() instanceof LocalPrincipal) allowed=allow("account:"+authentication.getName(),System.currentTimeMillis());
        }
        if(!allowed) {
            response.setStatus(429); response.setHeader("Retry-After", "60"); response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":\"RATE_LIMITED\",\"message\":\"请求过于频繁，请一分钟后重试\"}"); return;
        }
        chain.doFilter(request, response);
    }
    /**
     * 原子更新IP或已认证账户固定时间窗；最多4096个活跃键，满时清除过期项，仍满则拒绝新键。
     *
     * @param address 带ip或account前缀的限速键，不为空；IP只取直连地址
     *
     * @param now 当前时间，单位毫秒
     *
     * @return 本次是否可继续认证，不为空
     */
    public synchronized boolean allow(String address, long now) {
        long[] window = windows.get(address);
        if (window == null || now - window[0] >= 60000) {
            windows.entrySet().removeIf(entry -> now - entry.getValue()[0] >= 60000);
            if (windows.size() >= 4096) return false;
            window = new long[] {now, 0}; windows.put(address, window);
        }
        return ++window[1] <= 20;
    }
}
