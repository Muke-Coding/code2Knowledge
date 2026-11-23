package com.code2knowledge.identity.security;
import com.code2knowledge.identity.service.SessionLockService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
/** 服务端锁屏门禁；锁定会话只能查锁状态、获取CSRF、解锁或退出，不能借再次登录覆盖锁定。 */
public class SessionLockFilter extends OncePerRequestFilter {
    /** @param request 当前HTTP请求 @param response 当前HTTP响应 @param chain 后续安全链 @throws ServletException 安全链失败 @throws IOException 客户端断开；锁后新业务请求返回423，不回显业务数据 */
    @Override
    protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        // 使用去掉部署上下文的请求路径，兼容DispatcherServlet映射；不依赖容器拆分的servletPath/pathInfo。
        String path=request.getRequestURI().substring(request.getContextPath().length()),method=request.getMethod();
        boolean allowed=("GET".equals(method) && ("/api/v1/auth/lock-state".equals(path) || "/api/v1/auth/csrf".equals(path) || "/actuator/health".equals(path))) || ("POST".equals(method) && ("/api/v1/auth/unlock".equals(path) || "/api/v1/auth/logout".equals(path)));
        if(SessionLockService.locked(request.getSession(false)) && !allowed) {
            response.setStatus(423);response.setContentType("application/json;charset=UTF-8");response.getWriter().write("{\"code\":\"SESSION_LOCKED\",\"message\":\"当前会话已锁定，请先解锁\"}");return;
        }
        chain.doFilter(request,response);
    }
}
