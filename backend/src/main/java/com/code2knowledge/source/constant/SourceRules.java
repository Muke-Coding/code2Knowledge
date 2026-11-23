package com.code2knowledge.source.constant;

/** 来源协议边界与分页规模，不作为未来任务执行或文件可访问性保证。 */
public final class SourceRules {
    /** 只登记Git来源，平台不拉代码。 */
    public static final String REPOSITORY = "REPOSITORY";
    /** 运行时资料根目录下相对文件定位，不上传正文。 */
    public static final String DOCUMENT = "DOCUMENT";
    /** 来源列表固定每页20条，服务端先授权过滤再分页。 */
    public static final int PAGE_SIZE = 20;
    /** 常量容器禁止实例化。 */
    private SourceRules() { }
}
