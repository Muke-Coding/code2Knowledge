package com.code2knowledge.identity.domain.vo;
import lombok.Value;
/** 锁屏专用最小身份视图；不包含业务导航、权限或来源信息。 */
@Value
public class LockStateVO {
    /** 当前浏览器会话是否已由服务端锁定。 */
    boolean locked;
    /** 当前有效账户显示名称，仅用于识别解锁主体。 */
    String displayName;
}
