package com.code2knowledge.authorization.mapper;
import com.code2knowledge.authorization.domain.vo.MenuSettingVO;
import org.apache.ibatis.annotations.*;
import java.util.List;
/** 受控菜单显示配置；企业锁下核版本与审计，无软删除或事件，菜单不是权限事实。 */
@Mapper
public interface MenuSettingMapper {
    /**
     * @param tenant 当前企业
     * @return 已配置覆盖项，空列表使用源目录默认 */
    List<MenuSettingVO> list(@Param("tenant") String tenant);
    /**
     * @param tenant 当前企业
     * @param row 注册页面配置，权限字段只用于返回，不入库 */
    void save(@Param("tenant") String tenant,@Param("row") MenuSettingVO row);
}
