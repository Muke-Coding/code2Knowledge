package com.code2knowledge.source.service;

import com.code2knowledge.common.exception.ApiException;
import java.net.URI;
import java.net.URISyntaxException;

/** 来源定位纯语法验证，不做DNS、联网、文件读取或Git命令；真实可访问性和设备允许来源在执行前独立验证。 */
public final class SourceLocatorValidator {
    /** 纯校验器不持有可变状态，禁止实例化。 */
    private SourceLocatorValidator() { }
    /**
     * 接受HTTPS、SSH及git用户的SCP地址；拒绝URL凭证/查询/片段和本地协议，不将输入回显到错误日志。
     *
     * @param value 原始地址，非空且最多1000字符
     *
     * @return 去首尾空格后的原地址，不主动改写仓库身份
     *
     * @throws ApiException 非支持协议或包含凭证等非法结构时400
     */
    public static String repository(String value) {
        String locator = text(value);
        if (locator.matches("git@[A-Za-z0-9][A-Za-z0-9.-]*:[A-Za-z0-9_./-]+")) {
            safeSegments(locator.substring(locator.indexOf(':') + 1)); return locator;
        }
        try {
            URI uri = new URI(locator);
            boolean https = "https".equals(uri.getScheme()), ssh = "ssh".equals(uri.getScheme());
            if ((!https && !ssh) || uri.getHost() == null || uri.getHost().isEmpty() || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || (uri.getRawUserInfo() != null && !(ssh && "git".equals(uri.getRawUserInfo()))) || uri.getPort() == 0 || uri.getPort() > 65535
                    || uri.getPath() == null || uri.getPath().length() < 2 || locator.indexOf('\\') >= 0) invalid();
            safeSegments(uri.getPath().substring(1)); return locator;
        } catch (URISyntaxException error) { throw new ApiException(400, "INVALID_LOCATOR", "请使用不含凭证、查询或片段的HTTPS/SSH Git地址"); }
    }
    /**
     * 资料相对运行时允许资料根目录；禁止绝对路径、父目录、编码逃逸；不执行shell展开，不假称文件存在。
     *
     * @param value 相对定位，非空且最多1000字符，可含普通空格和中文文件名
     *
     * @return 经语法验证的相对路径，不为空
     *
     * @throws ApiException 非法路径时400
     */
    public static String document(String value) {
        String locator = text(value);
        if (locator.startsWith("/") || locator.startsWith("~") || locator.indexOf(':') >= 0 || locator.indexOf('\\') >= 0 || locator.indexOf('%') >= 0) invalid();
        safeSegments(locator); return locator;
    }
    /**
     * 验证常规Git分支名；分支仅是默认选择，执行时必须固定真实commit，本轮不解析远端分支。
     *
     * @param value 明确选择的分支名，不可null或空，最多200字符
     *
     * @return 原分支名，不为空，不强制master
     *
     * @throws ApiException Git常见非法引用字符或路径时400
     */
    public static String branch(String value) {
        if (value == null || value.isEmpty() || value.length() > 200 || value.startsWith("-") || value.startsWith("/") || value.endsWith("/") || value.endsWith(".") || value.contains("..") || value.contains("@{") || "@".equals(value)) invalidBranch();
        for (char character : value.toCharArray()) if (Character.isWhitespace(character) || Character.isISOControl(character) || "~^:?*[\\".indexOf(character) >= 0) invalidBranch();
        for (String part : value.split("/", -1)) if (part.isEmpty() || part.startsWith(".") || part.endsWith(".lock")) invalidBranch();
        return value;
    }
    /**
     * @param value 原始定位，null非法
     * @return 去首尾空格定位，不为空
     * @throws ApiException 超长、空值或控制字符时400 */
    private static String text(String value) {
        if (value == null || value.trim().isEmpty() || value.trim().length() > 1000) invalid();
        String result = value.trim(); for (char character : result.toCharArray()) if (Character.isISOControl(character)) invalid();
        return result;
    }
    /**
     * @param path 仓库或资料路径部分，不为空
     * @throws ApiException 空片段、点片段或父目录时400 */
    private static void safeSegments(String path) { for (String part : path.split("/", -1)) if (part.isEmpty() || ".".equals(part) || "..".equals(part)) invalid(); }
    /** @throws ApiException 固定400，不回显可能携带凭证的原始定位 */
    private static void invalid() { throw new ApiException(400, "INVALID_LOCATOR", "来源定位不合法，请使用无凭证Git地址或资料相对路径"); }
    /** @throws ApiException 固定400，要求显式选择有效分支 */
    private static void invalidBranch() { throw new ApiException(400, "INVALID_BRANCH", "请明确选择有效分支，例如master、main或release/版本号"); }
}
