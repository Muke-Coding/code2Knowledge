package com.code2knowledge.platform.config;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 平台启动入口，属于平台配置层；默认诊断模式仅健康检查，platform配置启用身份、目录及数据库迁移。
 */
@SpringBootApplication(scanBasePackages = "com.code2knowledge")
public class PlatformApplication {

    /**
     * 启动 Java 平台进程；默认诊断无需数据库；platform配置必须连接真实数据库并完成迁移。
     *
     * @param args Spring 启动参数，允许为空数组，不允许传入凭证明文
     */
    public static void main(String[] args) {
        SpringApplication.run(PlatformApplication.class, args);
    }
}
